export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Add backend routes here before falling back to the React frontend.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
