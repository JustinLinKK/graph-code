import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  configurable: true,
  value: ResizeObserverMock
});

window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
