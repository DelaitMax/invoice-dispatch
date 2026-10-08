export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness probe — never touches a dependency */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Process is up */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                            /** Format: date-time */
                            timestamp: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness probe — Postgres SELECT 1 + Redis PING */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ready */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok" | "error";
                            components: {
                                /** @enum {string} */
                                database: "ok" | "error";
                                /** @enum {string} */
                                redis: "ok" | "error";
                            };
                        };
                    };
                };
                /** @description At least one dependency is down */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok" | "error";
                            components: {
                                /** @enum {string} */
                                database: "ok" | "error";
                                /** @enum {string} */
                                redis: "ok" | "error";
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create an invoice for an existing client and enqueue PDF rendering + email delivery */
        post: {
            parameters: {
                query?: never;
                header?: {
                    "Idempotency-Key"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        /** @default USD */
                        currency?: string;
                        items: {
                            description: string;
                            /** @default 1 */
                            quantity?: number;
                            unitAmountMinor: number;
                        }[];
                        notes?: string;
                    };
                };
            };
            responses: {
                /** @description Idempotent replay of a previous request */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            invoiceId: string;
                            invoiceNumber: string;
                            /** @enum {string} */
                            status: "PENDING" | "PDF_RENDERING" | "PDF_READY" | "EMAIL_SENDING" | "SENT" | "FAILED";
                            /** @enum {string} */
                            currency: "USD" | "EUR" | "GBP";
                            totalMinor: number;
                            /** Format: email */
                            recipientEmail: string;
                            /** Format: date-time */
                            issuedAt: string;
                        };
                    };
                };
                /** @description Accepted for processing */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            invoiceId: string;
                            invoiceNumber: string;
                            /** @enum {string} */
                            status: "PENDING" | "PDF_RENDERING" | "PDF_READY" | "EMAIL_SENDING" | "SENT" | "FAILED";
                            /** @enum {string} */
                            currency: "USD" | "EUR" | "GBP";
                            totalMinor: number;
                            /** Format: email */
                            recipientEmail: string;
                            /** Format: date-time */
                            issuedAt: string;
                        };
                    };
                };
                /** @description Request validation failed (VALIDATION_ERROR) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Missing/invalid session cookie, or (if API_KEY is configured) X-API-Key */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description The recipient email doesn't match a registered client (CLIENT_NOT_FOUND) */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Idempotency-Key reused with a different body (IDEMPOTENCY_KEY_CONFLICT) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Per-IP limit (RATE_LIMITED) or this account's invoice quota (USER_RATE_LIMITED) */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get an invoice, its billing snapshot, and its current status */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Invoice detail */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            invoiceId: string;
                            invoiceNumber: string;
                            /** @enum {string} */
                            status: "PENDING" | "PDF_RENDERING" | "PDF_READY" | "EMAIL_SENDING" | "SENT" | "FAILED";
                            /** @enum {string} */
                            currency: "USD" | "EUR" | "GBP";
                            totalMinor: number;
                            /** Format: email */
                            recipientEmail: string;
                            client: {
                                firstName: string;
                                lastName: string;
                                company: {
                                    name: string;
                                    address: string;
                                } | null;
                            };
                            items: {
                                position: number;
                                description: string;
                                quantity: number;
                                unitAmountMinor: number;
                                amountMinor: number;
                            }[];
                            /** Format: date-time */
                            issuedAt: string;
                            /** Format: date-time */
                            dueAt: string | null;
                            /** Format: date-time */
                            pdfGeneratedAt: string | null;
                            /** Format: date-time */
                            sentAt: string | null;
                            lastError: string | null;
                        };
                    };
                };
                /** @description Request validation failed (VALIDATION_ERROR) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Missing/invalid session cookie, or (if API_KEY is configured) X-API-Key */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Invoice not found, or not yours — only the creator and admins can read an invoice (INVOICE_NOT_FOUND) */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices/{id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download the rendered invoice PDF */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The PDF file */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/pdf": string;
                    };
                };
                /** @description Request validation failed (VALIDATION_ERROR) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Missing/invalid session cookie, or (if API_KEY is configured) X-API-Key */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Invoice not found, or not yours — only the creator and admins can read an invoice (INVOICE_NOT_FOUND) */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description The PDF hasn't been rendered yet (PDF_NOT_READY) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry a FAILED invoice — resets it to PENDING and re-enqueues rendering */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Retry accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            invoiceId: string;
                            /** @enum {string} */
                            status: "PENDING" | "PDF_RENDERING" | "PDF_READY" | "EMAIL_SENDING" | "SENT" | "FAILED";
                        };
                    };
                };
                /** @description Request validation failed (VALIDATION_ERROR) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Missing/invalid session cookie, or (if API_KEY is configured) X-API-Key */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Logged in, but not as an admin (ADMIN_REQUIRED) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Invoice not found, or not yours — only the creator and admins can read an invoice (INVOICE_NOT_FOUND) */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Invoice is not in a retryable (FAILED) state (INVOICE_NOT_RETRYABLE) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create an account (always role: user — see /auth/me) and start a session */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Account created, session cookie set */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: email */
                            email: string;
                            /** @enum {string} */
                            role: "admin" | "user";
                        };
                    };
                };
                /** @description Validation failed, or the email is already registered (VALIDATION_ERROR, EMAIL_TAKEN) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Registration is closed on this deployment — the default in production (REGISTRATION_DISABLED) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Too many requests (RATE_LIMITED) */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Log in and start a session */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Session cookie set */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: email */
                            email: string;
                            /** @enum {string} */
                            role: "admin" | "user";
                        };
                    };
                };
                /** @description Request validation failed (VALIDATION_ERROR) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Wrong email or password (INVALID_CREDENTIALS) */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
                /** @description Too many requests (RATE_LIMITED) */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Clear the session cookie (stateless JWT — this doesn't revoke it server-side) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Session cookie cleared */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get the currently logged-in user */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current user */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: email */
                            email: string;
                            /** @enum {string} */
                            role: "admin" | "user";
                        };
                    };
                };
                /** @description Missing/invalid session cookie, or (if API_KEY is configured) X-API-Key */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                message: string;
                                code?: string;
                                details?: {
                                    [key: string]: string[];
                                };
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
