/**
 * CSS for the Cognito Classic Hosted UI.
 *
 * Applied via CfnUserPoolUICustomizationAttachment in auth-stack.ts.
 * Matches the Transformotion dark theme: navy background (#0D1B2A), teal primary (#00C4B3).
 *
 * Cognito enforces an allowlist of CSS class names — only the .customizable
 * classes documented at https://docs.aws.amazon.com/cognito/latest/developerguide/hosted-ui-customization.html
 * are accepted. Raw HTML element selectors and undocumented classes are rejected.
 *
 * Allowed pseudo-selectors: :hover on .submitButton-customizable and
 * .idpButton-customizable; :focus on .inputField-customizable.
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
}

.lostPassword-customizable {
  color: #6b7280;
  font-size: 14px;
}
`;
