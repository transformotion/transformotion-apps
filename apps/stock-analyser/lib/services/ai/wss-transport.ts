import { getStockAnalyserClient, stockAnalyserClient } from '@/lib/api'
import { authService } from '@/lib/services/auth'
import { parseAIJsonResponse } from './response'
import type { ClaudeRequest } from './index'

type AIExecutionRequest = Omit<ClaudeRequest, 'cacheKey' | 'forceRefresh'>

export async function subscribeViaWss<T>(
  request: AIExecutionRequest,
  wssUrl: string,
  signal: AbortSignal,
): Promise<T> {
  if (!wssUrl) throw new Error('WSS URL not configured (NEXT_PUBLIC_SA_WSS_URL)')

  const token = await authService.getIdToken()
  const accountId = (await authService.getAccountIdForApp('stock-analyser')) ?? ''

  if (!token) throw new Error('No authentication token available')

  const ws = new WebSocket(
    `${wssUrl}?token=${encodeURIComponent(token)}&app=stock-analyser&accountId=${encodeURIComponent(accountId)}`,
  )

  const connectionId = await waitForConnectionId(ws, signal)
  const { jobId } = await stockAnalyserClient.claudeAsyncStart(
    {
      prompt: request.prompt,
      system: request.systemPrompt,
      webSearch: request.webSearch,
      maxTokens: request.maxTokens,
    },
    connectionId,
    signal,
  )

  await waitForJobComplete(ws, signal)

  const item = await getStockAnalyserClient().getCache(`job-${jobId}`)
  const jobStatus = JSON.parse(item.data) as { status: string; content?: string; message?: string }

  if (jobStatus.status === 'complete' && jobStatus.content) {
    return parseAIJsonResponse<T>(jobStatus.content)
  }
  if (jobStatus.status === 'error') {
    throw Object.assign(new Error(jobStatus.message || 'Job failed'), { __jobError: true })
  }
  throw new Error('Job result was not complete after WSS notification')
}

function waitForConnectionId(ws: WebSocket, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('WSS connection handshake timeout'))
    }, 10_000)

    const onAbort = () => {
      clearTimeout(timeout)
      ws.close()
      reject(new Error('Request aborted'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    ws.onerror = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('WSS connection failed'))
    }
    ws.onopen = () => ws.send(JSON.stringify({ action: 'init' }))
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string; connectionId?: string }
        if (msg.type === 'connected' && msg.connectionId) {
          clearTimeout(timeout)
          signal.removeEventListener('abort', onAbort)
          resolve(msg.connectionId)
        }
      } catch {
        // Ignore malformed messages during handshake.
      }
    }
  })
}

function waitForJobComplete(ws: WebSocket, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('WSS job completion timeout'))
    }, 600_000)

    const onAbort = () => {
      clearTimeout(timeout)
      ws.close()
      reject(new Error('Request aborted'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    ws.onerror = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('WSS connection failed during job'))
    }
    ws.onclose = (evt) => {
      if (!evt.wasClean) {
        clearTimeout(timeout)
        signal.removeEventListener('abort', onAbort)
        reject(new Error('WSS connection closed unexpectedly'))
      }
    }
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string }
        if (msg.type === 'job_complete') {
          clearTimeout(timeout)
          signal.removeEventListener('abort', onAbort)
          ws.close()
          resolve()
        }
      } catch {
        // Ignore unrelated or malformed messages.
      }
    }
  })
}
