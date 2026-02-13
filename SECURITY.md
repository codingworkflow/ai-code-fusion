# Security Policy

## Supported Versions

| Version                     | Supported |
| --------------------------- | --------- |
| Latest release              | Yes       |
| Older releases              | No        |
| Unreleased feature branches | No        |

## Reporting a Vulnerability

Do not open public issues for vulnerabilities.

Use GitHub private vulnerability reporting (Security Advisories -> Report a vulnerability) for this repository.

Include:

- Affected version or commit
- Reproduction steps
- Impact assessment
- Suggested remediation (if available)

## Response Targets

- Acknowledgement: within 2 business days
- Initial triage: within 5 business days
- Remediation plan: within 10 business days after triage
- Resolution target:
  - Critical/High: within 30 days
  - Medium/Low: within 90 days

Targets may be adjusted when fixes require coordinated release work.

## Disclosure Policy

- Use coordinated disclosure.
- Public disclosure happens after a fix is available or compensating controls are documented.
- If applicable, maintainers may request a CVE via the appropriate CNA.

## Scope

In scope examples:

- Authentication or authorization bypass
- Remote code execution or arbitrary command execution
- Secret exposure in code, artifacts, or CI logs
- Unsafe update or supply-chain integrity weaknesses

Out of scope examples:

- Best-practice suggestions without a concrete exploit path
- Denial-of-service requiring unrealistic local-only conditions
- Vulnerabilities in unsupported versions

## Safe Harbor

Good-faith security research that avoids data destruction, privacy violations, and service disruption will be treated as authorized for vulnerability disclosure purposes.
