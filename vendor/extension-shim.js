/* Force UMD browser-global path in extension context.
   Some browsers (Vivaldi) define exports/module in extension pages,
   which causes UMD bundles to take the CommonJS path instead of
   assigning to window. Shadowing them here fixes React/ReactDOM globals. */
var module = void 0;
var exports = void 0;
