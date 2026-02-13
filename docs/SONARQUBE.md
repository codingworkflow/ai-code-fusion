# SonarQube Integration

This document explains how to use the SonarQube integration with the AI Code Fusion.

## Prerequisites

1. Access to a SonarQube server (self-hosted or SonarCloud).
2. Generate an authentication token from your SonarQube instance.
   Note: The SonarQube Scanner is now included as a dependency in the project, so you don't need to install it separately.

## Configuration

1. Copy the `.env.sample` file to `.env`:
   ```bash
   cp .env.sample .env
   ```
2. Edit the `.env` file and set your SonarQube server URL, authentication token, and project key:
   ```bash
   SONAR_URL=http://your-sonarqube-server:9000
   SONAR_TOKEN=your-sonar-auth-token
   SONAR_PROJECT_KEY=ai-code-fusion
   ```
   The project key must match an existing project on your SonarQube server, or you need permissions to create new projects.

## Running a Scan

Run the following command to perform a SonarQube scan:

```bash
npm run sonar
```

This will:

1. Check if the required environment variables are set
2. Run tests with coverage if coverage data doesn't exist
3. Execute the SonarQube scanner with your server configuration

## Understanding Results

After the scan completes, you can view the results by:

1. Opening your SonarQube instance in a web browser
2. Navigating to your project (ai-code-fusion)
3. Reviewing the code quality metrics, issues, and recommendations

## Customizing the Analysis

To customize the SonarQube analysis configuration, edit the `sonar-project.properties` file in the root of the project.

## Continuous Integration

In a CI/CD pipeline, set the `SONAR_URL` and `SONAR_TOKEN` as environment variables in your CI platform (GitHub Actions, Jenkins, etc.) and call the `npm run sonar` script in your workflow.

## Troubleshooting

If you encounter issues:

- Make sure you've run `npm install` to install the SonarQube Scanner dependency
- Verify your authentication token has sufficient permissions
- Check network connectivity to your SonarQube server
- Review the console output for specific error messages
- If you encounter Java-related errors, ensure you have Java installed (JRE 11 or newer is required)

### Authorization Errors

If you see errors like "You're not authorized to analyze this project or the project doesn't exist":

1. **Project Permissions**: Ensure your token has permissions to the specific project or to create new projects
2. **Project Creation**: If the project doesn't exist already:
   - Create it manually in SonarQube first, or
   - Use a token from an account with "Create Projects" permission
3. **Token Scope**: Make sure the token is not limited to a different project
4. **Project Key**: Verify that SONAR_PROJECT_KEY in your .env matches the project key in SonarQube
   You can also ask your SonarQube administrator to:

- Create the project manually with the key matching your SONAR_PROJECT_KEY
- Grant your user the necessary permissions to the project
