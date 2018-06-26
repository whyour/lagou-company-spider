const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const _ = require('lodash');
const pQueue = require('p-queue');
const pRetry = require('p-retry');
const delay = require('delay');
const { contains } = require('sanife');

const {
  log,
  toArray,
  str
} = require('./utils');
const {
  load,
  save,
} = require('./io');

const filterStr = str => {
  return str.trim().replace(/\n(\s)+/g, '');
};

const grapDetail = async (page, id) => {

  let url = `https://www.lagou.com/gongsi/${id}.html`;
  await page.goto(url);

  let pageInfo = await page.evaluate(() => {
    let $ = document.querySelector.bind(document);
    let $$ = document.querySelectorAll.bind(document);
    let formHead = $('.form_head') && $('.form_head').innerText || '';
    let isValidatePage = formHead.indexOf('密码登录') < 0;
    if (!isValidatePage) return { isValidatePage };

    // let title = $('.job-name').innerText
    // let salary = $('.job_request .salary').innerText
    // let tags = Array.from($$('.job_request .position-label .labels')).map(o => o.innerText.trim()).join(',')
    let tags = $('#basic_container .item_content .type').nextSibling.nextSibling.innerText;
    let stage = $('#basic_container .item_content .process').nextSibling.nextSibling.innerText;
    // let stage = $('.c_feature .icon-glyph-trend').parentNode.innerText
    let employee = $('#basic_container .item_content .number').nextSibling.nextSibling.innerText;
    // let employee = $('.c_feature .icon-glyph-figure').parentNode.innerText.replace('人规模', '')
    // let companyIndex = $('.c_feature .icon-glyph-home').parentNode.innerText.replace('公司主页', '')
    let companyIndex = $('.company_info .company_main h1 a').href;
    // let address = $('.work_addr').innerText.replace('查看地图', '')
    let address = $('#basic_container .item_content .address').nextSibling.nextSibling.innerText;
    let companyName = $('.company_info .company_main h1').innerText;
    // let companyName = $('.job_company .fl').innerText.replace('拉勾认证企业', '').replace('拉勾未认证企业', '(未认证)')
    return {
      tags,
      stage,
      employee,
      companyIndex,
      address,
      companyName,
      isValidatePage,
    };
  });

  if (!pageInfo.isValidatePage) {
    return grapDetail(page, id);
  }

  Object.keys(pageInfo).forEach(key => {
    if (typeof pageInfo[key] == 'string')
      pageInfo[key] = pageInfo[key].trim();
  });

  return pageInfo;
};

let count = 1;
let len = 1;

const fetchDetail = async (id) => {
  const page = await browser.newPage();

  const detail = await grapDetail(page, id);

  await page.close();

  if (!detail.companyName) {
    log(`https://www.lagou.com/gongsi/${id}.html`, content);
  }

  log(`【${len}/${count++}】正在读取..${detail.companyName}`);

  return detail;
};

module.exports = async ({
  concurrency = 1
}) => {
  let queue = new pQueue({
    concurrency
  });

  let unique = (a) => [...new Set(a)];
  let _ids = await load('ids', []);
  let ids = unique(_ids.filter(o => {
    return o;
  }));
  len = ids.length;
  console.log(len, 'id个数');
  let details = await load('details', {});
  let tasks = ids.map(id => {
    return async () => {
      if (details[id]) return details[id];

      let detail = await pRetry(async () => {
        return await fetchDetail(id);
      }, {
          retries: 3
        });
      details[id] = detail;
      save('details', details);
    };
  });
  await queue.addAll(tasks);
  await queue.onIdle();
};