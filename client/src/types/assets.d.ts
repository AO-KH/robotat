// Vite's built-in asset declarations only cover lowercase extensions
declare module "*.JPG" {
  const src: string;
  export default src;
}
declare module "*.PNG" {
  const src: string;
  export default src;
}
