# AI YouTube Generator

A React Native app built with Expo and Expo Router for generating AI-powered YouTube videos.

## Features

- **Welcome Screen**: Introduction to the app
- **Tab Navigation**: Home, Generate, History, and Profile tabs
- **Video Generation**: Create AI-powered videos with customizable topics, duration, and style
- **History Tracking**: View and manage previously generated videos
- **User Profile**: Account management and settings

## Tech Stack

- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and SDK
- **Expo Router**: File-based navigation
- **TypeScript**: Type-safe development
- **React**: UI framework

## Getting Started

### Prerequisites

- Node.js (20.19.4 or higher recommended)
- npm or yarn
- Expo CLI (optional, but recommended)

### Installation

1. Navigate to the project directory:
   ```bash
   cd ai-youtube-generator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

### Available Scripts

- `npm start` - Start the Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator (macOS only)
- `npm run web` - Run in web browser

## Project Structure

```
ai-youtube-generator/
├── app/                    # App screens and navigation
│   ├── (tabs)/            # Tab-based screens
│   │   ├── _layout.tsx    # Tab navigation layout
│   │   ├── home.tsx       # Home screen
│   │   ├── generate.tsx   # Video generation screen
│   │   ├── history.tsx    # Video history screen
│   │   └── profile.tsx    # User profile screen
│   ├── _layout.tsx        # Root layout
│   └── index.tsx          # Welcome/landing screen
├── assets/                # Images, fonts, and other assets
├── app.json              # Expo configuration
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## Development

This app uses Expo Router for navigation, which provides:

- File-based routing system
- Automatic deep linking
- Typed navigation
- Tab and stack navigation

### Navigation Structure

1. **Welcome Screen** (`/`) - Landing page
2. **Tab Navigator** (`/(tabs)`) - Main app navigation
   - **Home** - Dashboard with stats and recent videos
   - **Generate** - Create new AI videos
   - **History** - View generated video history
   - **Profile** - User settings and account

## Next Steps

To continue development:

1. Integrate with AI video generation APIs
2. Add authentication and user management
3. Implement video storage and playback
4. Add sharing and social features
5. Integrate with YouTube API for publishing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is private and proprietary.