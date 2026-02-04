/**
 * NewsTemplates — Deterministic headline/body templates for story events (S4.3).
 *
 * Converts raw event data into readable, spectator-friendly news headlines.
 * Each category has multiple template variants for variety.
 */

/** Template result */
export interface NewsHeadline {
  headline: string;
  body: string;
}

// ============ TEMPLATE VARIANTS ============

const crimeHeadlines = [
  (perp: string, victim: string, amount: number) =>
    `${perp} robs ${victim} for ${amount} CRD`,
  (perp: string, victim: string, amount: number) =>
    `Crime wave: ${perp} steals ${amount} CRD from ${victim}`,
  (perp: string, victim: string, amount: number) =>
    `${victim} robbed of ${amount} CRD by ${perp}`,
];

const arrestHeadlines = [
  (name: string, fine: number) =>
    `${name} arrested — fined ${fine} CRD`,
  (name: string, fine: number) =>
    `Justice served: ${name} caught, ${fine} CRD fine`,
  (name: string, fine: number) =>
    `${name} behind bars after ${fine} CRD fine`,
];

const buildingBuiltHeadlines = [
  (type: string, x: number, z: number) =>
    `New ${type} opens at (${x},${z})`,
  (type: string, x: number, z: number) =>
    `City expands: ${type} built at (${x},${z})`,
];

const buildingClosedHeadlines = [
  (type: string) =>
    `${type} forced to close — insufficient funds`,
  (type: string) =>
    `Economic pressure: ${type} shuts down`,
];

const buildingOpenedHeadlines = [
  (type: string) =>
    `${type} reopens after financial recovery`,
  (type: string) =>
    `Good news: ${type} back in business`,
];

const agentJoinedHeadlines = [
  (name: string, profession: string) =>
    `${name} arrives in the city as ${profession}`,
  (name: string, profession: string) =>
    `Welcome ${name} — new ${profession} in town`,
];

const economicCrisisHeadlines = [
  () => 'Treasury critically low — city in crisis',
  () => 'Economic emergency declared',
];

const salaryHeadlines = [
  (total: number, count: number, band: string) =>
    `${total} CRD paid to ${count} workers (${band} economy)`,
];

const weeklyHeadlines = [
  (week: number, treasuryDelta: number) => {
    const dir = treasuryDelta >= 0 ? 'up' : 'down';
    return `Week ${week} report: Treasury ${dir} ${Math.abs(treasuryDelta)} CRD`;
  },
];

// ============ TEMPLATE SELECTOR ============

function pick<T>(templates: T[]): T {
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generate a news headline from event metadata.
 * Falls back to the raw headline if no template matches.
 */
export function generateNewsHeadline(
  category: string | undefined,
  rawHeadline: string,
  detail?: string,
): NewsHeadline {
  if (!category) return { headline: rawHeadline, body: '' };

  try {
    switch (category) {
      case 'crime': {
        // Parse from raw: "Name robbed Victim"
        // detail: "Amount: $50 (caught!)"
        const amountMatch = detail?.match(/Amount: \$(\d+)/);
        const amount = amountMatch ? Number(amountMatch[1]) : 0;
        const parts = rawHeadline.split(' robbed ');
        if (parts.length === 2) {
          return {
            headline: pick(crimeHeadlines)(parts[0], parts[1], amount),
            body: detail ?? '',
          };
        }
        // arrest: "Name arrested"
        const fineMatch = detail?.match(/Fine: \$(\d+)/);
        if (rawHeadline.includes('arrested') && fineMatch) {
          const name = rawHeadline.replace(' arrested', '');
          return {
            headline: pick(arrestHeadlines)(name, Number(fineMatch[1])),
            body: detail ?? '',
          };
        }
        break;
      }

      case 'building_built': {
        // "City Manager built Coffee Shop at (x,z)"
        const buildMatch = rawHeadline.match(/built (.+?) at \((-?\d+),(-?\d+)\)/);
        if (buildMatch) {
          return {
            headline: pick(buildingBuiltHeadlines)(buildMatch[1], Number(buildMatch[2]), Number(buildMatch[3])),
            body: '',
          };
        }
        break;
      }

      case 'building_closed': {
        const typeMatch = rawHeadline.match(/^(\w+)/);
        if (typeMatch) {
          return {
            headline: pick(buildingClosedHeadlines)(typeMatch[1]),
            body: rawHeadline,
          };
        }
        break;
      }

      case 'building_opened': {
        const typeMatch = rawHeadline.match(/^(\w+)/);
        if (typeMatch) {
          return {
            headline: pick(buildingOpenedHeadlines)(typeMatch[1]),
            body: rawHeadline,
          };
        }
        break;
      }

      case 'agent': {
        // "Name joined the city" with detail "Profession: worker"
        const profMatch = detail?.match(/Profession: (\w+)/);
        if (rawHeadline.includes('joined') && profMatch) {
          const name = rawHeadline.replace(' joined the city', '');
          return {
            headline: pick(agentJoinedHeadlines)(name, profMatch[1]),
            body: '',
          };
        }
        break;
      }

      case 'economic_crisis':
        return { headline: pick(economicCrisisHeadlines)(), body: rawHeadline };

      case 'salary_paid': {
        const salaryMatch = rawHeadline.match(/Paid (\d+) CRD .* (\d+) agents \((\w+)/);
        if (salaryMatch) {
          return {
            headline: pick(salaryHeadlines)(Number(salaryMatch[1]), Number(salaryMatch[2]), salaryMatch[3]),
            body: '',
          };
        }
        break;
      }

      case 'weekly': {
        // Try to parse week number and treasury delta from raw headline
        const weekMatch = rawHeadline.match(/Week (\d+)/);
        const deltaMatch = rawHeadline.match(/([+-]?\d+) CRD/);
        if (weekMatch && deltaMatch) {
          return {
            headline: pick(weeklyHeadlines)(Number(weekMatch[1]), Number(deltaMatch[1])),
            body: detail ?? '',
          };
        }
        return { headline: rawHeadline, body: detail ?? '' };
      }
    }
  } catch {
    // Template parsing failed — fall through to raw
  }

  return { headline: rawHeadline, body: '' };
}
