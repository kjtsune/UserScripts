## mikananiBgmScore

Mikan 蜜柑计划首页显示 Bangumi 评分 / 标签 / 链接。

**可选配置**

在代码前几行里修改，有注释说明。

```
let config = {
    // 若 minScore 的值大于0.1，会隐藏低于该评分的条目。
    minScore: 0,
    // 清除无效标签的正则匹配规则
    tagsRegex: /\d{4}|TV|动画|小说|漫|轻改|游戏改|原创|[a-zA-Z]/,
    // 标签数量限制，填0禁用标签功能。
    tagsNum: 3,
    logLevel: 2,
};
```

### FAQ

* 评分根据上映天数缓存：10天内缓存1天。20天内缓存2天。半年内缓存5天。超过半年缓存15天。
* NSFW 条目评分会标为 0.1，不隐藏。网络错误也会，只能等待缓存过期。
* 标签会过滤掉标注数少于10的。取前三个，剩下的鼠标悬停评分处会显示。
![](https://github.com/kjtsune/UserScripts/raw/main/mikananiBgmScore/screenshot.jpg)
