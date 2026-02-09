/// <reference types="vite/client" />

// Vite ?worker import suffix — returns a Worker constructor
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
