// src/utils/responseHelper.js
// 统一 API 响应格式工具
// 所有接口响应都应使用此模块生成，确保前端能以一致的方式解析结果。

/**
 * 生成统一格式的 API 响应体
 *
 * @param {boolean} success  请求是否成功
 * @param {*}       data     成功时返回的数据（失败时传 null）
 * @param {string}  message  对本次请求的描述信息
 * @param {string}  [error]  失败时的详细错误信息（生产环境会被脱敏）
 * @returns {{ success: boolean, data: *, message: string, error: string|undefined, timestamp: string }}
 */
function createResponse(success, data, message, error) {
  const response = {
    success: Boolean(success),
    data: data ?? null,
    message: message || (success ? '请求成功' : '请求失败'),
    timestamp: new Date().toISOString(),
  };

  // 仅在失败时携带 error 字段
  if (!success && error) {
    // 生产环境下不向前端暴露内部错误细节，仅在开发环境透出
    response.error = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : String(error);
  }

  return response;
}

/**
 * 便捷方法：生成成功响应体
 * @param {*}      data     返回的数据
 * @param {string} [message='请求成功'] 描述信息
 */
function success(data, message = '请求成功') {
  return createResponse(true, data, message);
}

/**
 * 便捷方法：生成失败响应体
 * @param {string} message  描述信息
 * @param {string} [error]  详细错误
 */
function failure(message, error) {
  return createResponse(false, null, message, error);
}

/**
 * Express 响应助手 — 直接发送成功响应（200）
 * @param {import('express').Response} res
 * @param {*}      data
 * @param {string} [message]
 */
function sendOk(res, data, message) {
  return res.status(200).json(success(data, message));
}

/**
 * Express 响应助手 — 直接发送创建成功响应（201）
 */
function sendCreated(res, data, message) {
  return res.status(201).json(success(data, message || '资源创建成功'));
}

/**
 * Express 响应助手 — 直接发送客户端错误响应（400）
 */
function sendBadRequest(res, message = '请求参数错误', error) {
  return res.status(400).json(failure(message, error));
}

/**
 * Express 响应助手 — 直接发送未授权响应（401）
 */
function sendUnauthorized(res, message = '未授权访问', error) {
  return res.status(401).json(failure(message, error));
}

/**
 * Express 响应助手 — 直接发送禁止访问响应（403）
 */
function sendForbidden(res, message = '禁止访问', error) {
  return res.status(403).json(failure(message, error));
}

/**
 * Express 响应助手 — 直接发送资源未找到响应（404）
 */
function sendNotFound(res, message = '资源未找到', error) {
  return res.status(404).json(failure(message, error));
}

/**
 * Express 响应助手 — 直接发送服务器错误响应（500）
 */
function sendServerError(res, message = '服务器内部错误', error) {
  return res.status(500).json(failure(message, error));
}

module.exports = {
  createResponse,
  success,
  failure,
  sendOk,
  sendCreated,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendServerError,
};
