import type { IRContext } from '../../../ir/context';
import type { IROperationObject, IRPathsObject } from '../../../ir/ir';
import { operationToId } from '../../shared/utils/operation';
import type {
  OperationObject,
  PathItemObject,
  RequestBodyObject,
  ResponseObject,
} from '../types/spec';
import { contentToSchema, mediaTypeObject } from './mediaType';
import { paginationField } from './pagination';
import { schemaToIrSchema } from './schema';

interface Operation
  extends Omit<OperationObject, 'parameters'>,
    Pick<IROperationObject, 'id' | 'parameters'> {}

const parseOperationJsDoc = ({
  irOperation,
  operation,
}: {
  irOperation: IROperationObject;
  operation: Operation;
}) => {
  if (operation.deprecated !== undefined) {
    irOperation.deprecated = operation.deprecated;
  }

  if (operation.description) {
    irOperation.description = operation.description;
  }

  if (operation.summary) {
    irOperation.summary = operation.summary;
  }

  if (operation.tags && operation.tags.length) {
    irOperation.tags = operation.tags;
  }
};

const initIrOperation = ({
  method,
  operation,
  path,
}: Pick<IROperationObject, 'method' | 'path'> & {
  operation: Operation;
}): IROperationObject => {
  const irOperation: IROperationObject = {
    id: operation.id,
    method,
    path,
  };

  parseOperationJsDoc({
    irOperation,
    operation,
  });

  return irOperation;
};

const operationToIrOperation = ({
  context,
  method,
  operation,
  path,
}: Pick<IROperationObject, 'method' | 'path'> & {
  context: IRContext;
  operation: Operation;
}): IROperationObject => {
  const irOperation = initIrOperation({ method, operation, path });

  if (operation.parameters) {
    irOperation.parameters = operation.parameters;
  }

  if (operation.requestBody) {
    const requestBody =
      '$ref' in operation.requestBody
        ? context.resolveRef<RequestBodyObject>(operation.requestBody.$ref)
        : operation.requestBody;
    const content = mediaTypeObject({
      content: requestBody.content,
    });
    if (content) {
      const pagination = paginationField({
        context,
        name: '',
        schema: {
          description: requestBody.description,
          ...content.schema,
        },
      });

      irOperation.body = {
        mediaType: content.mediaType,
        schema: schemaToIrSchema({
          context,
          schema: {
            description: requestBody.description,
            ...('$ref' in operation.requestBody
              ? operation.requestBody
              : content.schema),
          },
        }),
      };

      if (pagination) {
        irOperation.body.pagination = pagination;
      }

      if (requestBody.required) {
        irOperation.body.required = requestBody.required;
      }

      if (content.type) {
        irOperation.body.type = content.type;
      }
    }
  }

  for (const name in operation.responses) {
    if (!irOperation.responses) {
      irOperation.responses = {};
    }

    const response = operation.responses[name]!;
    const responseObject =
      '$ref' in response
        ? context.resolveRef<ResponseObject>(response.$ref)
        : response;
    const content = mediaTypeObject({
      content: responseObject.content,
    });

    if (content) {
      irOperation.responses[name] = {
        mediaType: content.mediaType,
        schema: schemaToIrSchema({
          context,
          schema: {
            description: responseObject.description,
            ...contentToSchema({ content }),
          },
        }),
      };
    } else {
      irOperation.responses[name] = {
        schema: {
          description: responseObject.description,
          // TODO: parser - cover all statues with empty response bodies
          // 1xx, 204, 205, 304
          type: name === '204' ? 'void' : 'unknown',
        },
      };
    }
  }

  // TODO: parser - handle security
  // baz: operation.security

  // TODO: parser - handle servers
  // qux: operation.servers

  return irOperation;
};

export const parseOperation = ({
  context,
  method,
  operation,
  operationIds,
  path,
}: {
  context: IRContext;
  method: Extract<
    keyof PathItemObject,
    'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put' | 'trace'
  >;
  operation: Operation;
  operationIds: Map<string, string>;
  path: keyof IRPathsObject;
}) => {
  // TODO: parser - support throw on duplicate
  if (operation.operationId) {
    const operationKey = `${method.toUpperCase()} ${path}`;

    if (operationIds.has(operation.operationId)) {
      console.warn(
        `❗️ Duplicate operationId: ${operation.operationId} in ${operationKey}. Please ensure your operation IDs are unique. This behavior is not supported and will likely lead to unexpected results.`,
      );
    } else {
      operationIds.set(operation.operationId, operationKey);
    }
  }

  if (!context.ir.paths) {
    context.ir.paths = {};
  }

  if (!context.ir.paths[path]) {
    context.ir.paths[path] = {};
  }

  operation.id = operationToId({
    context,
    id: operation.operationId,
    method,
    path,
  });

  context.ir.paths[path][method] = operationToIrOperation({
    context,
    method,
    operation,
    path,
  });
};
