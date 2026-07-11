## Packages
framer-motion | Essential for high-quality, smooth page transitions and interactive element animations
react-hook-form | Required for performant, accessible form state management
@hookform/resolvers | Required to use Zod schemas with react-hook-form
lucide-react | Beautiful, consistent iconography

## Notes
- "Space Grotesk" font is imported via Google Fonts in index.css
- The application uses a custom context `DemoModalContext` to allow triggering the "Book a Demo" modal from anywhere in the app (including the navigation bar).
- All API calls use the standard TanStack Query setup and the pre-defined shared Zod schemas.
