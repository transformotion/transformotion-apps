/**
 * CSS for the Cognito Classic Hosted UI.
 *
 * Applied via CfnUserPoolUICustomizationAttachment in auth-stack.ts.
 * Matches the Transformotion dark theme: navy background (#0D1B2A), teal primary (#00C4B3).
 *
 * Only Cognito's named .customizable classes are permitted — raw HTML element
 * selectors (body, h1, a, etc.) are rejected by the API with a 400 error.
 *
 * If the user pool is ever migrated to Cognito Managed Login (v2), these selectors
 * will need to be replaced with the Managed Login CSS custom properties instead.
 */
export const cognitoHostedUiCss = `
.background-customizable {
  background-color: #0D1B2A;
}

.banner-customizable {
  padding: 24px 0 8px 0;
  background-color: #0D1B2A;
}

.label-customizable {
  font-weight: 500;
  font-size: 14px;
  color: #e8eaf0;
}

.textDescription-customizable {
  font-size: 14px;
  color: #6b7280;
  padding-top: 8px;
  padding-bottom: 12px;
}

.inputField-customizable {
  color: #e8eaf0;
  background-color: #1c2030;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  font-size: 14px;
}

.inputField-customizable:focus {
  border-color: #00C4B3;
  box-shadow: 0 0 0 3px rgba(0, 196, 179, 0.15);
  outline: none;
}

.submitButton-customizable {
  background-color: #00C4B3;
  border-color: #00C4B3;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.submitButton-customizable:hover {
  background-color: #00b0a0;
  border-color: #00b0a0;
  color: #ffffff;
}

.errorMessage-customizable {
  color: #f05656;
  font-size: 14px;
  background-color: transparent;
}

.idpButton-customizable {
  background-color: #1c2030;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  color: #e8eaf0;
  font-size: 14px;
  font-weight: 500;
}

.idpButton-customizable:hover {
  background-color: #252a3a;
  border-color: rgba(0, 196, 179, 0.3);
}

.idpButtonText-customizable {
  color: #e8eaf0;
  font-weight: 500;
}

.or-customizable {
  color: #6b7280;
  font-size: 12px;
}

.lostPassword-customizable {
  color: #6b7280;
  font-size: 14px;
}

.redirect-customizable {
  color: #6b7280;
  font-size: 14px;
}
`;
