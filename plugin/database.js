(function (Database) {
  "use strict";

  const async = require("async");

  const nodebb = require("./nodebb"),
    constants = require("./constants");

  const db = nodebb.db,
    user = nodebb.user;

  //FIXME Remove Points object if User is deleted or create utility method for ACP
  Database.delete = function (uid, done) {
    db.sortedSetRemove(constants.NAMESPACE, uid, done);
  };

  Database.getPoints = function (uid, done) {
    db.sortedSetScore(constants.NAMESPACE, uid, done);
  };

  Database.getUsers = function (limit, done) {
    async.waterfall(
      [
        async.apply(
          db.getSortedSetRevRangeWithScores,
          constants.NAMESPACE,
          0,
          limit
        ),
        function (scoredUsers, next) {
          var scores = {},
            ids = scoredUsers.map(function (scoredUser) {
              scores[scoredUser.value] = scoredUser.score;
              return scoredUser.value;
            });
          next(null, ids, scores);
        },
        function (uids, scoreMap, next) {
          user.getUsersFields(
            uids,
            ["picture", "username", "userslug"],
            function (error, users) {
              if (error) {
                return next(error);
              }

              next(
                null,
                users.map(function (user) {
                  user.points = scoreMap[user.uid] || 0;
                  return user;
                })
              );
            }
          );
        },
      ],
      done
    );
  };

  Database.incrementBy = function (uid, increment, done) {
    db.sortedSetIncrBy(constants.NAMESPACE, increment, uid, done);
  };

  /**
   *
   * @param {*} uid
   * @param {*} increment
   * @param {*} newScore
   * @param {'post' | 'topic' | 'unvote' | 'upvote'} from 来源
   */
  Database.addPointsChangeLog = (uid, increment, newScore, from) => {
    const logEntry = {
      timestamp: new Date().getTime(),
      userId: uid,
      increment: increment,
      newScore: newScore,
      from,
    };
    // 将日志记录到数据库或其他存储介质
    // setObject会覆盖原有的存储信息
    db.getObjectField(
      `${constants.LOG_NAMESPACE}:${uid}`,
      "pointLogs",
      (err, logs) => {
        if (err) {
          console.error("Error getting points change logs:", err);
          return;
        }
        if (!logs) {
          logs = "";
        }
        // 添加新的日志条目
        logs += `; ${JSON.stringify(logEntry)}`;

        // 更新日志条目
        db.setObjectField(
          `${constants.LOG_NAMESPACE}:${uid}`,
          "pointLogs",
          logs,
          err => {
            if (err) {
              console.error("Error adding points change log:", err);
            }
          }
        );
      }
    );
  };
})(module.exports);
