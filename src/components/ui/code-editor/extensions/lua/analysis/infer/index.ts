// =============================================================================
// TYPE INFERENCE - RE-EXPORTS
// =============================================================================
// This module provides centralized type inference utilities extracted from
// the SemanticAnalyzer. Individual inference functions are organized by
// category for better maintainability.

export { inferExpressionType, type InferContext } from './infer-expression';
export {
    inferBinaryExpressionType,
    inferLogicalExpressionType,
    inferUnaryExpressionType,
} from './infer-binary';
export { inferCallExpressionType } from './infer-call';
export { inferTableType } from './infer-table';
export { inferMemberExpressionType, inferIndexExpressionType } from './infer-member';
