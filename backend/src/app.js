"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const documentUpload_1 = require("./utils/documentUpload");
dotenv_1.default.config();
const app = (0, express_1.default)();
(0, documentUpload_1.ensureUploadDirectories)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/uploads/public', express_1.default.static(documentUpload_1.publicUploadDir));
// API Routes
app.use('/api', routes_1.default);
// Basic Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'JCB Exchange API is running' });
});
// Default Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: 'Invalid JSON payload.',
        });
    }
    if (err.message.includes('Only JPG, PNG, WEBP, and PDF files are allowed.') ||
        err.message.includes('Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed.') ||
        err.message.includes('PDF files must be 3MB or smaller.') ||
        err.message.includes('Image files must be 5MB or smaller.') ||
        err.message.includes('Video files must be 15MB or smaller.') ||
        err.message.includes('File too large')) {
        return res.status(400).json({ success: false, error: err.message });
    }
    if (err.code === 'ENOENT') {
        return res.status(404).json({ success: false, error: 'Requested file was not found.' });
    }
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});
exports.default = app;
//# sourceMappingURL=app.js.map