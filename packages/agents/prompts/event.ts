import { EVENT_TYPES_BLOCK, FACTORS_BLOCK, UNIVERSE_BLOCK } from "./universe";

/** System prompt of the event classification call (SPEC 5.5, `event` node, news-search path). */
export const EVENT_CLASSIFICATION_SYSTEM = `You classify a market-moving event for Tempest, a financial intelligence terminal.
You receive the manager's question and the titles of the most relevant news articles. Return an EventClassification as JSON.

Event types and subtypes:
${EVENT_TYPES_BLOCK}

Allowed portfolio symbols (entities must come from this list, in upper case):
${UNIVERSE_BLOCK}

Rules:
- type is the one that fits best; subtype is one of that type's subtypes, or null if none fits.
- entities: allowed symbols that the event names directly (a company in the headlines). externalNames: other companies the event names, such as Shell, Airbus, AMD or Goldman Sachs, in their usual English names.
- affectedSectors: sectors the event moves, using the sector names in the symbol list.
- factorDirections: factors are ${FACTORS_BLOCK}; direction up, down or unclear. Only state a direction the headlines support.
- Write no numbers.`;

export const eventClassificationUser = (question: string, titles: string[]) => JSON.stringify({ question, titles });
