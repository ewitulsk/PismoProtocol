# EAS Deployment Setup

This document describes the EAS (Expo Application Services) deployment configuration for the Pismo Mobile app.

## Project Configuration

- **EAS Project ID**: `c88c6c5a-f5c2-4d16-8a50-39debf19bf82`
- **EAS Project Owner**: `ewitulsk`
- **EAS Slug**: `pismomobile`

## GitHub Workflow

The deployment is handled by the GitHub workflow located at `.github/workflows/eas-deploy.yml`. This workflow:

1. **Triggers on**:
   - Push to `main` or `master` branches
   - Pull requests to `main` or `master` branches
   - Manual workflow dispatch

2. **Build Profiles**:
   - **Preview**: Used for pull requests and internal testing
   - **Production**: Used for pushes to main/master branches

3. **Store Submission**: Automatically submits to App Store and Google Play Store on production builds

## Required Setup

### 1. EAS Authentication

You need to set up EAS authentication in your GitHub repository:

1. Go to your EAS dashboard and generate an access token
2. Add the token as a GitHub secret named `EXPO_TOKEN`
3. Update the workflow to use the token for authentication

### 2. App Store Connect Configuration

For iOS submissions, update the `eas.json` file with your:
- Apple ID
- App Store Connect App ID
- Apple Team ID

### 3. Google Play Console Configuration

For Android submissions:
1. Create a service account in Google Play Console
2. Download the service account JSON key
3. Add it as a GitHub secret or update the path in `eas.json`

### 4. Environment Variables

The workflow uses these environment variables:
- `EAS_PROJECT_ID`: `c88c6c5a-f5c2-4d16-8a50-39debf19bf82`
- `EAS_PROJECT_OWNER`: `ewitulsk`

## Manual Deployment

To deploy manually:

1. Install EAS CLI: `npm install -g @expo/cli eas-cli`
2. Login to EAS: `eas login`
3. Build for production: `eas build --platform all --profile production`
4. Submit to stores: `eas submit --platform all --latest`

## Build Profiles

- **Development**: For local development with development client
- **Preview**: For internal testing and pull request builds
- **Production**: For production releases and store submissions

## Troubleshooting

1. **Authentication Issues**: Ensure your EAS token is valid and has the necessary permissions
2. **Build Failures**: Check the EAS build logs for specific error messages
3. **Store Submission Issues**: Verify your App Store Connect and Google Play Console configurations