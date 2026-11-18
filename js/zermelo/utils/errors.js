/**
 * Soorten fouten. De soort bepaalt de melding op het scherm en of een verzoek opnieuw geprobeerd wordt.
 *  network    geen antwoord of time-out
 *  server     5xx of een antwoord dat geen geldige Zermelo-JSON is
 *  rate       429, te veel verzoeken (ook: het eigen verzoekbudget is op)
 *  auth       401, token ongeldig of verlopen
 *  permission 403, token mist een recht, of een veld/filter bestaat niet (meer)
 *  request    overige 4xx
 *  data       het antwoord klopt niet (onvolledig, verkeerde vorm)
 */
export const RETRYABLE_KINDS = ["network", "server", "rate", "data"]

export class ZermeloError extends Error {
    constructor(message, details = {}) {
        super(message)
        this.name = new.target.name
        this.kind = details.kind || "request"
        this.status = details.status
        this.endpoint = details.endpoint
        this.zermeloMessage = details.zermeloMessage
        this.eventId = details.eventId
        this.retryAfter = details.retryAfter
    }

    get retryable() {
        return RETRYABLE_KINDS.includes(this.kind)
    }

    /** Korte code voor op het scherm, bv. "auth 401" of "network". */
    get code() {
        return this.kind + (this.status ? " " + this.status : "")
    }
}

/** network, server, rate en data: tijdelijk. */
export class ZermeloNetworkError extends ZermeloError {
}

/** auth en permission. */
export class ZermeloAuthorizationError extends ZermeloError {
}

/**
 * Maakt de juiste fout bij een HTTP- of Zermelo-status.
 */
export function errorForStatus(status, details = {}) {
    let message = (details.endpoint ? details.endpoint + ": " : "") + status + (details.zermeloMessage ? " " + details.zermeloMessage : "")
    if (status === 401) {
        return new ZermeloAuthorizationError(message, {...details, status, kind: "auth"})
    }
    if (status === 403) {
        return new ZermeloAuthorizationError(message, {...details, status, kind: "permission"})
    }
    if (status === 429) {
        return new ZermeloNetworkError(message, {...details, status, kind: "rate"})
    }
    if (status >= 500) {
        return new ZermeloNetworkError(message, {...details, status, kind: "server"})
    }
    return new ZermeloError(message, {...details, status, kind: "request"})
}
