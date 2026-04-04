"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
var supabase = (0, supabase_js_1.createClient)(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var sql = "\n-- Create admin_codes table for tracking valid signup codes\nCREATE TABLE IF NOT EXISTS admin_codes (\n    code VARCHAR(50) PRIMARY KEY,\n    role VARCHAR(50) NOT NULL, -- e.g., 'Insurer Admin', 'Claims Adjuster'\n    is_active BOOLEAN DEFAULT true,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())\n);\n\n-- Seed an admin code\nINSERT INTO admin_codes (code, role, is_active)\nVALUES ('NEXUS-ADMIN-2026', 'Insurer Admin', true)\nON CONFLICT (code) DO NOTHING;\n\n-- Create admin_users table\nCREATE TABLE IF NOT EXISTS admin_users (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    admin_code VARCHAR(50) REFERENCES admin_codes(code),\n    role VARCHAR(50) NOT NULL,\n    aadhaar_verified BOOLEAN DEFAULT false,\n    aadhaar_number VARCHAR(20),\n    biometric_verified BOOLEAN DEFAULT false,\n    face_descriptor TEXT,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())\n);\n";
function runMigration() {
    return __awaiter(this, void 0, void 0, function () {
        var error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase.rpc('exec_sql', { sql_query: sql })];
                case 1:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error("Migration Error:", error.message);
                    }
                    else {
                        console.log("Admin tables created and seeded successfully.");
                    }
                    return [2 /*return*/];
            }
        });
    });
}
runMigration();
