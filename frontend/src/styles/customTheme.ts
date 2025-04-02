import { ThemeVars } from '@mysten/dapp-kit';

export const customTheme: ThemeVars = {
	blurs: {
		modalOverlay: 'blur(0)',
	},
	backgroundColors: {
		primaryButton: '#150726', // mainBackground purple color
		primaryButtonHover: '#1e0a33', // slightly lighter purple
		outlineButtonHover: '#270d40', // even lighter purple
		modalOverlay: 'rgba(13, 4, 21, 0.8)', // Semi-transparent darkBackground
		modalPrimary: '#1a1a1a', // Dark gray
		modalSecondary: '#2a2a2a', // Medium gray
		iconButton: 'transparent',
		iconButtonHover: '#1e0a33', // slightly lighter purple
		dropdownMenu: '#0d0415', // darkBackground
		dropdownMenuSeparator: '#ffffff', // mainBackground
		walletItemSelected: '#0d0415', // darkBackground
		walletItemHover: '#150726', // mainBackground
	},
	borderColors: {
		outlineButton: '#ff69b4', // secondary color (hot pink)
	},
	colors: {
		primaryButton: '#ffffff', // white text for buttons
		outlineButton: '#ffffff', // white text for outline buttons
		iconButton: '#ffffff', // white text for icon buttons
		body: '#ffffff', // white
		bodyMuted: '#ffffff', // white
		bodyDanger: '#ff69b4', // secondary color
	},
	radii: {
		small: '6px',
		medium: '8px',
		large: '12px',
		xlarge: '16px',
	},
	shadows: {
		primaryButton: '0px 4px 12px rgba(0, 0, 0, 0.3)',
		walletItemSelected: '0px 2px 6px rgba(0, 0, 0, 0.3)',
	},
	fontWeights: {
		normal: '400',
		medium: '500',
		bold: '600',
	},
	fontSizes: {
		small: '14px',
		medium: '16px',
		large: '18px',
		xlarge: '20px',
	},
	typography: {
		fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
		fontStyle: 'normal',
		lineHeight: '1.3',
		letterSpacing: '1',
	},
};