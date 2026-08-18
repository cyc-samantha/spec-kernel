import { publishedSchema } from '../kernel/published-schema.ts';

try {
  console.log(JSON.stringify(publishedSchema(), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
