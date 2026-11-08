/** CSS Modules: every class name resolves to a scoped string. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
