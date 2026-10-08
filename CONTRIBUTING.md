# Contributing to LicenX

Thank you for your interest in contributing to **LicenX**! We welcome community contributions to make this open-source cryptographic licensing engine faster, more secure, and easier to use.

---

## 🛠️ Development Workflow

### 1. Fork & Clone
```bash
git clone https://github.com/your-username/LicenX.git
cd LicenX
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Local Development
Start the local full-stack server running Vite and Express:
```bash
npm run dev
```

### 4. Code Quality & Formatting
Ensure TypeScript checks and linting pass before submitting:
```bash
npm run lint
npm run build
```

---

## 📌 Submission Guidelines

1. **Feature Branches:** Create a feature branch off `main` (e.g. `feature/hardware-id-enhancement` or `fix/r2-upload-timeout`).
2. **Clear Commit Messages:** Write clear, concise commit messages explaining the rationale behind your change.
3. **No Regressions:** Verify that existing endpoints and client SDKs (such as `x_license_python`) remain backward-compatible.
4. **Documentation:** Update relevant markdown files (`README.md`, `VERIFICATION_AUDIT.md`, or SDK docs) if introducing new parameters or configuration flags.

---

## 🐛 Reporting Bugs & Issues

When reporting an issue, please include:
- Operating system and runtime environment (Node.js version, Cloudflare Pages, etc.).
- Steps to reproduce the bug.
- Expected versus actual behavior.
- Relevant non-sensitive logs or error stack traces.

---

## 📜 License

By contributing to LicenX, you agree that your contributions will be licensed under the **MIT License**.
