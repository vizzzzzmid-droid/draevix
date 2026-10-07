import { z } from 'zod';
import {
  kodikDescribe,
  normalizeKodikLink,
  throwKodikError,
  type TKodikDescribe
} from '../../helpers/kodik';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const kodikDescribeRoute = protectedProcedure
  .input(
    z.object({
      link: z.string().trim().min(1).max(500)
    })
  )
  .query(async ({ input }): Promise<{ link: string } & TKodikDescribe> => {
    const link = normalizeKodikLink(input.link);

    invariant(link, { code: 'NOT_FOUND', message: 'Invalid Kodik link' });

    try {
      return { link, ...(await kodikDescribe(link)) };
    } catch (error) {
      throw throwKodikError(error);
    }
  });

export { kodikDescribeRoute };
