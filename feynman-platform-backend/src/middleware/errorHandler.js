// src/middleware/errorHandler.js
// 全局错误处理中间件
// 必须放在所有路由之后、404 处理器之后，作为 Express 最后一道错误拦截。

const { createResponse } = require('../utils/responseHelper');

/**
 * 根据错误内容推断 HTTP 状态码
 * @param {Error} err
 * @returns {number} HTTP 状态码
 */
function inferStatusCode(err) {
  // 显式挂载的 status 字段（自定义错误可以手动设置）
  if (err.status) return err.status;

  // Mongoose 验证错误
  if (err.name === 'ValidationError') return 400;

  // Mongoose 类型转换错误（如把 ObjectId 格式的参数传成普通字符串）
  if (err.name === 'CastError') return 400;

  // MongoDB 重复键冲突（mongoose 9 会把 MongoServerError 抛出来）
  if ((err.name === 'MongoError' || err.name === 'MongoServerError') &&
      (err.code === 11000 || err.code === 11001)) {
    return 409;
  }

  // Express body-parser JSON 解析错误
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' ||
      err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
    return 400;
  }

  return 500;
}

/**
 * 将 Mongoose ValidationError 的 details 拼接成可读消息
 */
function formatValidationMessage(err) {
  if (err.name !== 'ValidationError' || !err.errors) return err.message;
  const details = Object.values(err.errors).map(e => e.message || e.kind);
  return details.join('; ');
}

/**
 * 提取重复键冲突的字段名，生成友好提示
 */
function formatDuplicateKeyMessage(err) {
  const match = /index:\s+\w+_1\s+dup key:\s+\{\s*:\s*"([^"]+)"/.exec(err.message);
  const field = match ? match[1] : 'field';
  return `${field} 已存在，请更换后重试`;
}

/**
 * 全局错误处理中间件
 *
 * Express 5 注意事项：
 *   与 Express 4 不同，Express 5 中 async 路由处理器抛出的异常不会自动
 *   转发到这个中间件（需要 controller 自己 try/catch 或使用 next(err)）。
 *   本中间件主要兜底：
 *     - 同步抛出但没被 catch 的错误
 *     - Mongoose / MongoDB 底层错误
 *     - body-parser 的 JSON 解析错误
 *     - 404 处理器中 next('route') 后的兜底
 */
function errorHandler(err, req, res, next) {
  // 已经开始发送响应，不再处理
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = inferStatusCode(err);

  let message;
  if (err.name === 'ValidationError') {
    message = formatValidationMessage(err);
  } else if ((err.name === 'MongoError' || err.name === 'MongoServerError') &&
             (err.code === 11000 || err.code === 11001)) {
    message = formatDuplicateKeyMessage(err);
  } else if (err.type && err.type.startsWith('entity.')) {
    message = '请求体格式错误';
  } else if (statusCode === 500) {
    message = '服务器内部错误';
  } else {
    message = err.message || '请求失败';
  }

  // 开发环境打印完整堆栈，方便调试
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${new Date().toISOString()}] ERROR ${statusCode} ${req.method} ${req.path}`);
    console.error(err);
  }

  // 生产环境下：500 错误不向前端透出 detail，4xx 可以透出（因为是客户端错误）
  const errorDetail = statusCode >= 500
    ? undefined
    : err.message;

  res.status(statusCode).json(createResponse(
    false,        // success
    null,         // data
    message,      // message
    errorDetail,  // error
  ));
}

module.exports = errorHandler;
