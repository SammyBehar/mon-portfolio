function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    return res.redirect('/login');
  }
}

const authMiddleware = isAuthenticated;

module.exports = {
  isAuthenticated,
  authMiddleware
};
