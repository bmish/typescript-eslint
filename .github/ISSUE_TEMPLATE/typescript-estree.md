---
name: '@typescript-eslint/typescript-estree'
about: Report an issue with the '@typescript-eslint/typescript-estree' package
title: ''
labels: 'package: typescript-estree, triage'
assignees: ''
---

<!--
Please don't ignore this template.

If you ignore it, we're just going to respond asking you to fill it out, which wastes everyone's time.
The more relevant information you can include, the faster we can find the issue and fix it without asking you for more info.
-->

<!--
🚨 STOP 🚨 𝗦𝗧𝗢𝗣 🚨 𝑺𝑻𝑶𝑷 🚨

This issue template is only for problems specifically with the `@typescript-eslint/typescript-estree` package.

If you have a problem with a specific lint rule, please back out and select the `@typescript-eslint/eslint-plugin` template.
-->

- [ ] I have tried restarting my IDE and the issue persists.
- [ ] I have updated to the latest version of the packages.
- [ ] I have [read the FAQ](https://github.com/typescript-eslint/typescript-eslint/blob/main/docs/linting/TROUBLESHOOTING.md) and my problem is not listed.

**Repro**

<!--
Include a ***minimal*** reproduction case.
The more irrelevant code/config you give, the harder it is for us to investigate.

Please consider creating an isolated reproduction repo to make it easy for the volunteer maintainers debug your issue.
-->

```TS
// the code you're trying to parse
```

```TS
// the code you're using to do the parse of the aforementioned code
```

**Expected Result**

<!--
What did you expect to happen?
Please be specific here - list the exact lines and messages you expect.
-->

**Actual Result**

<!--
What actually happened?
Please be specific here - list the exact lines and messages that caused errors
-->

**Additional Info**

<!--
Did eslint throw an exception?

Please run your lint again with the --debug flag, and dump the output below.
i.e. eslint --ext ".ts,.js" src --debug
-->

**Versions**

| package                                | version |
| -------------------------------------- | ------- |
| `@typescript-eslint/typescript-estree` | `X.Y.Z` |
| `TypeScript`                           | `X.Y.Z` |
| `node`                                 | `X.Y.Z` |
