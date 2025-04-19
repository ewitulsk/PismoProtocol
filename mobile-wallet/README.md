# Mobile Sui Wallet (React Native)

This is a React Native application for a basic Sui wallet, built according to the provided wireframes and design document.

## Project Structure

```
/src
 ├─ App.tsx                 (navigation container, context provider)
 ├─ navigation/RootStack.tsx
 ├─ screens/                (UI screens: Home, Settings, etc.)
 ├─ components/             (Reusable UI components)
 ├─ context/WalletContext.tsx (State management)
 └─ utils/                  (Helpers: clipboard, sui RPC, validation)
```

## Getting Started

1.  Install dependencies: `npm install` or `yarn install`
2.  Run the app: `npx expo start` (or `yarn start`)
3.  Follow the Expo Go prompts to open on your device or simulator.

## Implemented Features

*   Basic navigation structure (Home, Settings, New Wallet, Seed Phrase, Sign Tx/Msg).
*   UI layout for each screen based on the design doc.
*   State management context (`WalletContext`) for wallets and networks.
*   Placeholder components and utility functions.
*   Basic secure storage setup using `expo-secure-store` (integration needed).
*   Accessibility `testID`s and `accessibilityRole`s added where specified.

## Missing / TODO

Based on the design document (Section 4) and implementation placeholders:

1.  **Send / Receive Flows:** QR scan button exists, but the subsequent amount entry and confirmation screens need implementation.
2.  **Balance Refresh:** Placeholder function `fetchBalance` needs actual RPC implementation. Interval logic and pull-to-refresh UI needed.
3.  **Network Management:** Default networks are listed. Need UI/logic for adding/editing custom RPC endpoints.
4.  **Wallet Naming:** Currently uses placeholders; need robust UI prompts during creation/import.
5.  **Secure Storage Integration:** `expo-secure-store` added, but `WalletContext` needs full integration to save/load keys/seeds securely.
6.  **Crypto Operations:** Placeholder functions in `utils/sui.ts` need implementation using a Sui SDK (e.g., `@mysten/sui.js`) or direct RPC calls for:
    *   Key derivation (PK -> Address, Seed -> PK/Address)
    *   Transaction signing
    *   Personal message signing
    *   Mnemonic generation
7.  **Input Validation:** Placeholder functions in `utils/validation.ts` need proper implementation.
8.  **ActionSheet Implementation:** Currently simulated with `react-native-paper` Modals. Could use a dedicated library or native module.
9.  **Error Handling:** More robust error handling and user feedback needed.
10. **Biometrics Unlock:** Not implemented.
11. **Unit Tests:** Jest/RNTL setup and tests using `testID`s need to be written.
12. **Styling:** Basic layout is done, but detailed styling/theming is minimal.
13. **Seed Phrase Confirmation Quiz:** Logic exists but could be expanded.
