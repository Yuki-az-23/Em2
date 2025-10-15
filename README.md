# EM2 - Emotion Manager 2

An innovative emotion-based social media platform where user interactions are guided by the ECBridge (Emotion-Color Bridge) algorithm.

## 🌟 Overview

EM2 is a unique social media application that combines emotions and colors to create meaningful connections between users and content. The platform uses a sophisticated algorithm to personalize feeds and determine how posts evolve based on user interactions.

### Key Features

- **ECBridge Algorithm**: Proprietary emotion-color calculation system that personalizes content
- **8 Core Emotions**: Joy, Trust, Feared, Surprised, Sad, Disgust, Angry, Anticipated
- **8 Colors**: Yellow, Lime, Green, Aqua, Blue, Pink, Red, Orange
- **Dynamic Posts**: Posts evolve emotionally based on user interactions
- **Rich Content**: EditorJS-powered content with images, videos, and embeds
- **Cross-Platform**: Web, iOS, and Android from a single codebase

## 📂 Repository Structure

```
EM2/
├── OLD/              # Legacy codebase (Node.js + MongoDB + React)
│   ├── API/          # Express backend
│   └── CLIENT/       # React frontend
├── CLAUDE.md         # Development guide for Claude Code
├── MIGRATION_PLAN.md # Comprehensive modernization plan
└── README.md         # This file
```

## 🚀 Current Status

**Phase**: Planning & Architecture

This repository currently contains:
- **Legacy Application** (`OLD/` directory): The original EM2 implementation
- **Architecture Documentation**: Complete system overview in `CLAUDE.md`
- **Migration Plan**: Detailed 10-phase modernization strategy in `MIGRATION_PLAN.md`

## 🔄 Modernization Project

We're migrating from the legacy stack to a modern, scalable architecture:

### Old Stack
- Backend: Node.js + Express + MongoDB
- Frontend: Create React App + Material-UI
- No mobile support

### New Stack (Planned)
- Backend: Supabase (PostgreSQL + Auth + Real-time + Storage)
- Frontend: Vite + React 18 + Pure CSS
- Mobile: Capacitor (iOS + Android)
- Content: EditorJS with modern plugins

**Timeline**: 23 weeks (~6 months)
**See**: [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for complete details

## 📖 Documentation

- **[CLAUDE.md](CLAUDE.md)**: Comprehensive guide to the current codebase architecture
- **[MIGRATION_PLAN.md](MIGRATION_PLAN.md)**: Complete modernization roadmap with 10 phases

## 🧠 The ECBridge Algorithm

The heart of EM2 is the Emotion-Color Bridge (ECBridge) algorithm, which:

1. **Personalizes Feeds**: Users see content based on their emotional state
2. **Evolves Posts**: Post emotions change based on user interactions
3. **Creates Connections**: Matches users with content that resonates emotionally

**Example**: A user feeling "Joy + Yellow" interacting with a "Sad + Blue" post might transform it to "Trust + Green"

### ECBridge Components

- **ECBridgeComment**: Calculates emotional responses when users comment
- **ECBridgeUser**: Determines feed filtering based on user's emotional state

## 🛠️ Development

### Legacy Application (OLD/)

#### API Setup
```bash
cd OLD/API
npm install
# Create .env with MONGO_URL, PORT, JWT_SECRET
npm start
```

#### Client Setup
```bash
cd OLD/CLIENT
npm install
npm start
```

### Future Application (TBD)

Will be set up in Phase 0 of the migration plan. See [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for details.

## 🎯 Getting Started

### For Developers

1. **Understand the Architecture**: Read [CLAUDE.md](CLAUDE.md)
2. **Review Migration Plan**: Study [MIGRATION_PLAN.md](MIGRATION_PLAN.md)
3. **Explore Legacy Code**: Check out `OLD/` directory
4. **Start Contributing**: Follow the migration phases

### For New Contributors

The legacy codebase has some intentional typos maintained for consistency:
- `conttrollers/` instead of `controllers/`
- `ECBrige` instead of `ECBridge`
- `SginIn`/`SginUp` instead of `SignIn`/`SignUp`

These will be fixed in the modernization.

## 📊 Project Goals

- **Performance**: Sub-3s load times, 90+ Lighthouse score
- **Scalability**: Support 10k+ concurrent users
- **Cross-Platform**: Single codebase for web and mobile
- **Maintainability**: Modern, testable, documented code
- **User Experience**: Smooth, intuitive, emotion-driven interface

## 🔐 Security & Privacy

- Row Level Security (RLS) in Supabase
- JWT-based authentication
- Secure image upload and storage
- Privacy-focused analytics

## 📝 License

[To be determined]

## 👥 Team

- **Original Developer**: Aleksey Zgeria
- **Current Maintainer**: [To be updated]

## 🤝 Contributing

This project is currently in the planning phase. Contribution guidelines will be added as development progresses.

## 📧 Contact

For questions or collaboration opportunities, please open an issue on GitHub.

---

**Built with ❤️ and 🎨 emotions**
