// src/controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { createResponse, sendCreated, sendBadRequest, sendServerError } = require('../utils/responseHelper');

exports.register = async (req, res) => {
  try {
            // 1. 从请求体中获取用户名、邮箱、密码
            const { username, email, password } = req.body;
    
            // 2. 检查用户或邮箱是否已存在
            let user = await User.findOne({ email });
            if (user) {
                return sendBadRequest(res, 'Email already exists');
            }
            user = await User.findOne({ username });
            if (user) {
                return sendBadRequest(res, 'Username already exists');
            }
    
            // 3. 创建新用户实例
            user = new User({ username, email, password });
    
            // 4. 对密码进行哈希加密
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
    
            // 5. 将新用户保存到数据库
            await user.save();
    sendCreated(res, null, '用户注册成功');
  } catch (err) {
     console.error(`用户注册失败: ${err.message}`);
    sendServerError(res, '用户注册失败', err.message);
  }
};

exports.login = async (req, res) => {
  // ... 用户登录逻辑 ...
};