import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not unmount between cases on its own; without this, the second test in a
// file queries a document that still holds the first test's markup.
afterEach(cleanup);
