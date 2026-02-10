UPDATE `user`
SET `role` = 'admin'
WHERE lower(`email`) = lower('test@dispatch.local');
