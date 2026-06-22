/**
 * CSS for the Cognito Classic Hosted UI owned by the Launchpad auth domain.
 *
 * This mirrors the M18 Transformotion corporate palette for the
 * Launchpad-owned Cognito User Pool.
 */
export const cognitoHostedUiCss = `
.background-customizable {
  background-color: #23476B;
}

.banner-customizable {
  padding: 24px 0 8px 0;
  background-color: #23476B;
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
  color: #EBEFF2;
  background-color: #0E2339;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  font-size: 14px;
}

.inputField-customizable:focus {
  border-color: #33C1C5;
  outline: none;
}

.submitButton-customizable {
  background-color: #33C1C5;
  border-color: #33C1C5;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #0E2339;
}

.submitButton-customizable:hover {
  background-color: #2fb1b5;
  border-color: #2fb1b5;
  color: #0E2339;
}

.errorMessage-customizable {
  color: #f05656;
  font-size: 14px;
  background-color: transparent;
}

.idpButton-customizable {
  background-color: #0E2339;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  color: #e8eaf0;
  font-size: 14px;
  font-weight: 500;
}

.idpButton-customizable:hover {
  background-color: #1D2F44;
}

`;
