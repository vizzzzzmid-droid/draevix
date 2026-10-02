import { z } from 'zod';

// community server list. anyone can add a server through a pull request, there
// is no moderation: entries that fail validation are skipped, and servers that
// do not answer keep their registry name without live details
const SERVERS_REGISTRY_URL =
  'https://raw.githubusercontent.com/vizzzzzmid-droid/draevix/main/servers.json';

const zRegistryServerEntry = z.object({
  name: z.string().min(1).max(64),
  address: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[A-Za-z0-9.-]+(:\d+)?$/),
  description: z.string().max(256).optional()
});

type TRegistryServerEntry = z.infer<typeof zRegistryServerEntry>;

const parseServersRegistry = (input: unknown): TRegistryServerEntry[] => {
  if (!Array.isArray(input)) return [];

  const entries: TRegistryServerEntry[] = [];

  for (const row of input) {
    const parsed = zRegistryServerEntry.safeParse(row);

    if (parsed.success) entries.push(parsed.data);
  }

  return entries;
};

export { parseServersRegistry, SERVERS_REGISTRY_URL, zRegistryServerEntry };
export type { TRegistryServerEntry };
