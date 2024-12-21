// ==UserScript==
// @name         bgmAirToday
// @namespace    https://github.com/kjtsune/UserScripts
// @version      2024.12.21
// @description  Bangumi 番组计划首页的在看条目，置顶与高亮今日放送部分。
// @author       kjtsune
// @match        https://bgm.tv/*
// @icon         https://bgm.tv/img/favicon.ico
// @license MIT
// ==/UserScript==
'use strict';

// 获取今天的日期，格式化为 YYYY-MM-DD
let today = new Date().toISOString().slice(0, 10);
let yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

let divs = document.querySelectorAll('div.prg_popup');

let specifiedIds = []; // 指定要提前的 id 列表

divs.forEach(div => {
    // 获取 div 中的 "首播" 信息
    let releaseInfo = div.querySelector('span.tip').textContent;

    let isAirToday = releaseInfo.includes(today);
    let isAirYesterday = releaseInfo.includes(yesterday);
    if (isAirToday || isAirYesterday) {
        let id = div.id.match(/\d+/)[0];
        let aElement = document.querySelector(`a[rel="#prginfo_${id}"]`);
        if (aElement.className.includes('epBtnWatched')) { return; }

        if (isAirToday) {
            let preEp = aElement.parentElement.previousElementSibling;
            if (preEp.firstChild.className.includes('epBtnWatched')) {
                aElement.setAttribute('style', 'color: #506948; background: #40f166;')
                specifiedIds.push(aElement.getAttribute('subject_id'))
                console.log(aElement);
            }
        } else {
            specifiedIds.push(aElement.getAttribute('subject_id'))
        }
    }
});

const wrapper = document.querySelector('.infoWrapper_tv');
const panels = Array.from(wrapper.querySelectorAll('[id^="subjectPanel"]'));

// 1. 提取指定 ID 的 panels，并移到数组最前
const specifiedPanels = panels.filter(panel => {
    const panelId = panel.id.replace('subjectPanel_', '');
    return specifiedIds.includes(panelId);
});

// 2. 提取未在指定列表中的 panels
const remainingPanels = panels.filter(panel => {
    const panelId = panel.id.replace('subjectPanel_', '');
    return !specifiedIds.includes(panelId);
});

// 4. 合并指定 panels 和排序后的 panels
const sortedPanels = [...specifiedPanels, ...remainingPanels];

// 5. 清空原始容器，并按照顺序重新添加 panels，同时设置 odd/even 类
wrapper.innerHTML = ''; // 清空容器
sortedPanels.forEach((panel, index) => {
    panel.classList.remove('odd', 'even'); // 移除原有 odd/even 类
    if (index % 2 === 0) {
        panel.classList.add('odd');
    } else {
        panel.classList.add('even');
    }
    wrapper.appendChild(panel); // 重新添加到容器中
});
