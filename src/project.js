const inquirer = require('inquirer');
const fse = require('fs-extra');
const download = require('download-git-repo');
const { TEMPLATE_GIT_REPO, INJECT_FILES } = require('./constants');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const memFs = require('mem-fs');
const editor = require('mem-fs-editor');
const { getDirFileName } = require('./utils');
const { exec } = require('child_process');

function Project(options) {
  this.config = Object.assign({
    projectName: '',
    description: ''
  }, options);
  const store = memFs.create();
  this.memFsEditor = editor.create(store);
}

Project.prototype.create = function() {
  this.inquire()
    .then((answer) => {
      this.config = Object.assign(this.config, answer);
      this.generate();
    });
};

Project.prototype.inquire = function() {
  const prompts = [];
  const { projectName, description } = this.config;
  // 判定项目名称
  // 如果只使用了 use init 命令 则补充 项目名
  // 如果 使用了 use init demo 则需要判定 是否 文件夹名称重复
  if (typeof projectName !== 'string') {
    prompts.push({
      type: 'input',
      name: 'projectName',
      message: '请输入项目名：',
      validate(input) {
        if (!input) {
          return '项目名不能为空';
        }
        if (fse.existsSync(input)) {
          return '当前目录已存在同名项目，请更换项目名';
        }
        return true;
      }
    });
  } else if (fse.existsSync(projectName)) {
    prompts.push({
      type: 'input',
      name: 'projectName',
      message: '当前目录已存在同名项目，请更换项目名',
      validate(input) {
        if (!input) {
          return '项目名不能为空';
        }
        if (fse.existsSync(input)) {
          return '当前目录已存在同名项目，请更换项目名';
        }
        return true;
      }
    });
  }

  // 添加项目描述
  if (typeof description !== 'string') {
    prompts.push({
      type: 'input',
      name: 'description',
      message: '请输入项目描述'
    });
  }

  // 选择框架
  let choices = [];
  for (let i=0;i<TEMPLATE_GIT_REPO.length;i++){
    choices.push(TEMPLATE_GIT_REPO[i]);
  }
  Object.keys(TEMPLATE_GIT_REPO).forEach((key) => {
    // 遍历 系统配置 key 默认值 进行用户选项
    choices.push(key)
  });

  prompts.push({
    type: 'list',
    message: '请选择您需要的框架: ',
    name: 'select',
    choices,
    filter: function (val) { // 使用filter将回答变为小写
      return val.toLowerCase();
    }
  });
  return inquirer.prompt(prompts);
};

/**
 * 模板替换
 * @param {string} source 源文件路径
 * @param {string} dest 目标文件路径
 * @param {object} data 替换文本字段
 */
Project.prototype.injectTemplate = function(source, dest, data) {
  this.memFsEditor.copyTpl(
    source,
    dest,
    data
  );
};

Project.prototype.generate = function() {
  // 名字， 描述，选项
  const { projectName, description, select } = this.config;
  const projectPath = path.join(process.cwd(), projectName);
  const downloadPath = path.join(projectPath, '__download__');

  const downloadSpinner = ora('正在初始化模板，请稍等...');
  downloadSpinner.start();
  // 下载git repo
  download(TEMPLATE_GIT_REPO[select], downloadPath, { clone: true }, (err) => {
    if (err) {
      downloadSpinner.color = 'red';
      downloadSpinner.fail(err.message);
      return;
    }

    downloadSpinner.color = 'green';
    downloadSpinner.succeed('模板初始化成功！');

    // 复制文件
    console.log();
    const copyFiles = getDirFileName(downloadPath);

    copyFiles.forEach((file) => {
      fse.copySync(path.join(downloadPath, file), path.join(projectPath, file));
      console.log(`${chalk.green('✔ ')}${chalk.grey(`创建: ${projectName}/${file}`)}`);
    });

    INJECT_FILES.forEach((file) => {
      this.injectTemplate(path.join(downloadPath, file), path.join(projectName, file), {
        projectName,
        description
      });
    });

    this.memFsEditor.commit(() => {
      INJECT_FILES.forEach((file) => {
        console.log(`${chalk.green('✔ ')}${chalk.grey(`创建: ${projectName}/${file}`)}`);
      });

      fse.remove(downloadPath);

      process.chdir(projectPath);

      // git 初始化
      console.log();
      const gitInitSpinner = ora(`cd ${chalk.green.bold(projectName)}目录, 执行 ${chalk.green.bold('git init')}`);
      gitInitSpinner.start();

      const gitInit = exec('git init');
      gitInit.on('close', (code) => {
        if (code === 0) {
          gitInitSpinner.color = 'green';
          gitInitSpinner.succeed(gitInit.stdout.read());
        } else {
          gitInitSpinner.color = 'red';
          gitInitSpinner.fail(gitInit.stderr.read());
        }

        // 安装依赖
        console.log();
        const installSpinner = ora(`安装项目依赖 ${chalk.green.bold('yarn install')}, 请稍后...`);
        installSpinner.start();
        exec('yarn install', (error, stdout, stderr) => {
          if (error) {
            installSpinner.color = 'red';
            installSpinner.fail(chalk.red('安装项目依赖失败，请自行重新安装！'));
            console.log(error);
          } else {
            installSpinner.color = 'green';
            installSpinner.succeed('安装依赖成功');
            console.log(`${stderr}${stdout}`);

            console.log();
            console.log(chalk.green('创建项目成功！'));
            console.log(chalk.green('Start coding!!!'));
          }
        })
      })
    });
  });
};

module.exports = Project;
