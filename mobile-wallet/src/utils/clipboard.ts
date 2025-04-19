import * as Clipboard from 'expo-clipboard';

export const copyToClipboard = async (text: string) => {
  try {
    await Clipboard.setStringAsync(text);
    // Optional: Add user feedback (e.g., a toast message)
    // console.log('Copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy text to clipboard', error);
    // Optional: Add user feedback for error
  }
};

// Example of getting content - might not be needed based on spec
export const getClipboardContent = async (): Promise<string | null> => {
    try {
        return await Clipboard.getStringAsync();
    } catch (error) {
        console.error('Failed to get text from clipboard', error);
        return null;
    }
}; 