/**
 * App — top-level component.
 * Rendering logic lives in AppRouter; this file is the entry point
 * that React Router and AuthProvider wrap.
 */
import { AppRouter } from './router/AppRouter';

export default function App() {
  return <AppRouter />;
}
