// Fetches HLS manifests and segments through Electron's network stack. This also
// supports stream servers that omit browser CORS headers (common with IPTV).
window.streamLoaderConfig = bridge => ({
  loader: class StreamLoader {
    constructor() { this.context = null; this.aborted = false; this.completed = false; this.stats = { aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0, loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } }; }
    load(context, config, callbacks) {
      this.context = context; this.callbacks = callbacks; this.aborted = false; this.completed = false; this.stats.loading.start = performance.now();
      bridge.fetch({ url: context.url, rangeStart: context.rangeStart, rangeEnd: context.rangeEnd }).then(response => {
        if (this.aborted) return;
        if (response.error) { callbacks.onError({ code: response.status, text: response.error }, context, null, this.stats); return; }
        const bytes = response.data instanceof Uint8Array ? response.data : new Uint8Array(response.data);
        const data = context.responseType === 'arraybuffer' ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new TextDecoder().decode(bytes);
        this.stats.loaded = this.stats.total = bytes.byteLength; this.stats.chunkCount = 1; this.stats.loading.first = this.stats.loading.end = performance.now();
        if (context.responseType === 'arraybuffer') callbacks.onProgress?.(this.stats, context, data, null);
        this.completed = true;
        callbacks.onSuccess({ url: response.url || context.url, data, code: response.status }, this.stats, context, null);
      }).catch(error => { if (!this.aborted) callbacks.onError({ code: 0, text: error.message || String(error) }, context, null, this.stats); });
    }
    abort() { if (this.aborted || this.completed) return; this.aborted = true; this.stats.aborted = true; this.callbacks?.onAbort?.(this.stats, this.context, null); }
    destroy() { if (!this.completed) this.abort(); this.context = null; this.callbacks = null; }
  }
});
