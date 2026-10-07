import { z } from 'zod';
import {
  anilibertyDescribe,
  throwAnilibertyError,
  type TAnilibertyDescribe
} from '../../helpers/aniliberty';
import { protectedProcedure } from '../../utils/trpc';

const anilibertyDescribeRoute = protectedProcedure
  .input(
    z.object({
      releaseId: z.number().int().positive()
    })
  )
  .query(async ({ input }): Promise<TAnilibertyDescribe> => {
    try {
      return await anilibertyDescribe(input.releaseId);
    } catch (error) {
      throw throwAnilibertyError(error);
    }
  });

export { anilibertyDescribeRoute };
