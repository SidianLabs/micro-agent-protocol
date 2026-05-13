# PAD-11: Documentation System

**Project:** MAP Protocol Open Source Release  
**Status:** In Progress  
**Last Updated:** 2026-03-30

## 1. Overview

MAP Protocol uses Docusaurus for documentation, enabling easy contribution and version management.

## 2. Documentation Structure

```
docs/
├── docusaurus.config.ts     # Docusaurus configuration
├── sidebars.ts              # Navigation sidebar
├── getting-started.md        # Quick start guide
├── src/
│   └── css/
│       └── custom.css      # Custom styling
├── static/
│   └── img/
│       └── logo.svg        # Site logo
└── sdk/
    ├── typescript.md        # TypeScript SDK docs
    ├── python.md            # Python SDK docs
    └── go.md                # Go SDK docs
```

## 3. Configuration

### 3.1 Site Settings

```typescript
const config = {
  title: 'MAP Protocol',
  tagline: 'Micro Agent Protocol - Open standard for AI delegation',
  url: 'https://maprotocol.ai',
  baseUrl: '/',
  organizationName: 'mapprotocol',
  projectName: 'map',
};
```

### 3.2 Navigation

**Navbar:**
- Documentation (doc sidebar)
- Version dropdown
- GitHub link

**Sidebar:**
- Getting Started
- Protocol
- SDKs
- Architecture
- Reference

## 4. Content

### 4.1 Getting Started

Quick start guide with installation and first dispatch.

### 4.2 SDK Documentation

Per-SDK documentation with:
- Installation instructions
- Usage examples
- API reference

### 4.3 Protocol Specification

Full protocol documentation including:
- Task envelope structure
- HTTP binding
- Error codes
- Authentication

## 5. Development

```bash
cd docs
npm install
npm run start      # Dev server
npm run build      # Production build
npm run deploy     # Deploy to GitHub Pages
```

## 6. Deployment

Documentation deploys to GitHub Pages via GitHub Actions.

- Trigger: Push to main
- Workflow: `.github/workflows/docs.yml`

## 7. Current Status

- [x] Docusaurus configuration created
- [x] Sidebar configuration created
- [x] Custom CSS created
- [x] Getting Started guide created
- [x] SDK documentation created
- [ ] npm dependencies need installation
- [ ] Initial build needed
- [ ] Deployment configuration needed

## 8. Future Enhancements

- Blog for announcements
- Versioned documentation
- Search integration
- Interactive API explorer