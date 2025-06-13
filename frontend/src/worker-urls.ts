import mainWasm   from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import mainWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import pthreadW   from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url';
export const bundle = { mainModule: mainWasm, mainWorker, pthreadWorker: pthreadW };
