const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const pQueue = require('p-queue');
const pRetry = require('p-retry');
const {
  contains
} = require('sanife');

const log = console.log.bind(console);
const {
  save,
  load
} = require('./io');

const {
  type,
  city,
  stages,
  domains
} = require('./config');

const grapInfo = content => {
  let $ = cheerio.load(content);
  let ids = Array.from($('#company_list .item_con_list').children())
    .map(item => $(item).find('a').data('lg-tj-cid'));

  let pagers = Array.from($('.pager_container').children());
  let totalPage = $(pagers[pagers.length - 2]).attr('page') || 1;
  let currentPage = +$('.pager_is_current').text() || 1;

  return {
    ids,
    totalPage,
    currentPage
  };
};

const navToNextPage = async (page, info) => {
  await page.click('.pager_is_current + .pager_not_current');
  await page.waitForNavigation({
    waitUntil: 'networkidle',
    networkIdleTimeout: 200,
  });
  let nextContent = await page.content();
  let nextInfo = grapInfo(nextContent);

  if (info.currentPage >= nextInfo.currentPage) {
    return navToNextPage(page, nextInfo);
  }

  return;
};

const fetchIds = async ({
  id,
  type,
  city,
  domain,
  stage
}) => {

  // let url = `https://www.lagou.com/jobs/list_${type}?px=default&city=${city}&isShowMoreIndustryField=true&hy=${domain}&jd=${stage}`
  // let url = "https://www.lagou.com/jobs/list_?city=%E5%85%A8%E5%9B%BD&cl=false&fromSearch=true&labelWords=&suginput="
  let url = `https://www.lagou.com/gongsi/${id}`;

  const page = await browser.newPage();
  await page.goto(url);

  let companyIds = [];

  for (let current = 1, totalPage = 1; current <= totalPage; current++) {
    let content = await page.content();
    let info = grapInfo(content);
    companyIds = companyIds.concat(info.ids);

    current = info.currentPage;
    totalPage = info.totalPage;

    log(`读取公司id.. 职位：${type} 领域：【${city}${domain}${stage}】${info.totalPage}/${info.currentPage}`);

    // log(`总页数/当前页: ${info.totalPage}/${info.currentPage}, 已爬取公司id数: ${companyIds.length}`)

    if (current < totalPage) {
      // 单页面导航到下一页
      await page.click('.pager_is_current + .pager_not_current');
      await page.waitForNavigation({
        waitUntil: 'networkidle',
        networkIdleTimeout: 500
      });
    }
  }
  await page.close();
  return companyIds;
};

const doExchange = async (arr) => {
  var len = arr.length;
  // 当数组大于等于2个的时候
  if (len >= 2) {
    // 第一个数组的长度
    var len1 = arr[0].length;
    // 第二个数组的长度
    var len2 = arr[1].length;
    // 2个数组产生的组合数
    var lenBoth = len1 * len2;
    //  申明一个新数组,做数据暂存
    var items = new Array(lenBoth);
    // 申明新数组的索引
    var index = 0;
    // 2层嵌套循环,将组合放到新数组中
    for (var i = 0; i < len1; i++) {
      for (var j = 0; j < len2; j++) {
        items[index] = arr[0][i] + "-" + arr[1][j];
        index++;
      }
    }
    // 将新组合的数组并到原数组中
    var newArr = new Array(len - 1);
    for (var i = 2; i < arr.length; i++) {
      newArr[i - 1] = arr[i];
    }
    newArr[0] = items;
    // 执行回调
    return doExchange(newArr);
  } else {
    return arr[0];
  }
};

module.exports = async ({
  concurrency = 1
}) => {
  let queue = new pQueue({
    concurrency
  });
  let queryCache = await load('queryCache', []);
  let ids = await load('ids', []);

  for (let domain of domains) {
    for (let stage of stages) {
      let queryKey = `${domain}&${stage}`;
      if (contains(queryCache, queryKey)) continue;
      let _ids = [...Array(360).keys()];
      let _stage = [...Array(8).keys()];
      let _tags = [24, 25, 33, 27, 29, 45, 31, 28, 47, 34, 35, 43, 32, 41, 26, 48, 38, 49, 15793, 15794, 10594];
      let all = await doExchange([_ids, _stage, _tags]);
      let tasks = all.map(id => {
        return async () => {
          let list = await pRetry(async () => fetchIds({
            id,
            type,
            city,
            domain,
            stage
          }), {
              retries: 3
          });
          if (list && list.length > 0) {
            ids = ids.concat(list);
            save('ids', ids);
          }
          queryCache.push(queryKey);
          save('queryCache', queryCache);
        };
      });
      await queue.addAll(tasks);
      await queue.onIdle();

    }
  }
};