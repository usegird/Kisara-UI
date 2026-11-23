const PRODUCTION_GATEWAY = 'https://gw.kisara-ui.com';
const PRODUCTION_APP = 'https://kisara-ui.com';
const DEV_GATEWAY = 'http://localhost:5186';
const DEV_APP = 'http://localhost:5173';

export const GATEWAY_ORIGIN: string = import.meta.env.DEV ? DEV_GATEWAY : PRODUCTION_GATEWAY;

export const APP_ORIGIN: string = import.meta.env.DEV ? DEV_APP : PRODUCTION_APP;

export const GATEWAY_FRAME_PATH = '/gateway.html';

export const GATEWAY_ENTRY_PATH = '/gateway-entry.html';
