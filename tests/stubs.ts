const NS: any = require('three');

/** Replace WebGLRenderer with a no-op that keeps the same API surface. */
export function THREE_STUB() {
  NS.WebGLRenderer = class {
    domElement: any;
    shadowMap: any = { enabled: false, type: 0 };
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    constructor(opts: any) {
      this.domElement = opts?.canvas ?? document.createElement('canvas');
    }
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
    getContext() { return null; }
  };
}
