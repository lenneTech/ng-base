# Angular Base

This is the base library of [lenne.Tech](https://lenne.tech) for Angular.

## Description

This library contains all the basics to start a new project in combination with the [lenne.Tech Nest Server](https://github.com/lenneTech/nest-server#lennetech-nest-server):- GraphQL service and elements for easy communication with GraphQL API (via Models)
- Standard Model with methods for mapping, cloning and comparing models
- Basic User Model with basic rights handling
- Loading Service for the subscription of loading processes
- Storage Service for comfortable saving of data in local storage
- GraphQL service and elements for easy communication with GraphQL API (via Models)
- Authentication service for user registration
- and much more

The detailed description of the features and instructions on how to use the library can be found in the [README.md of the library](projects/ng-base/src/README.md).

For setting up a new project we recommend our [Angular Starter](https://github.com/lenneTech/angular-starter), which already contains this library and also includes a few sample elements as templates.

## Requirements

- [Node.js](https://nodejs.org) LTS (with npm)
- [Angular CLI](https://cli.angular.io/)


## Test the package

```bash
npm run pack
```

Afterwards, the package can be included in an Angular project as follows in the `package.json` on a test basis:
```json
{
  "dependencies": {
    "@lenne.tech/ng-graphql-client": "file:/PATH_TO_PROJECT/ng-base/dist/graphql-client/lenne.tech-ng-base-X.X.X.tgz"
  }
}
```

## Publish

Update version in `projects/graphql-client/package.json` and `projects/graphql-client/package-lock.json`.

After that, the new package can be published as follows:
```bash
npm run publish
```


## Initialize log

The initialization of this library is inspired by
[The Best Way To Architect Your Angular Libraries](https://medium.com/@tomastrajan/the-best-way-to-architect-your-angular-libraries-87959301d3d3) from [Thomas Trajan](https://medium.com/@tomastrajan).

### Init library

Init Angular
```bash
ng new ng-base --createApplication false --prefix lt
ng g library ng-base --prefix lt
```

Change package name in `projects/ng-base/src`
```
"name": "@lenne.tech/ng-base"
```

Replace `path` configuration in `tsconfig.json`:
```json
{
  "paths": {
        "@lenne.tech/ng-base/*": [
          "projects/ng-base/*",
          "projects/ng-base"
        ],
        "@lenne.tech/ng-base": [
          "dist/ng-base/*",
          "dist/ng-base"
        ]
  }
}
```

Delete the content of the projects/some-lib/src/lib/ folder and remove content of the root public-api.ts file so that it’s empty.

Install [ng-samurai](https://github.com/kreuzerk/ng-samurai) to extend the Angular CLI for creating Sub-entries:
```
npm i -D ng-samurai
```

Create new Sub-entry (without component `--gc false` and module `--gm false`):
```
ng g ng-samurai:generate-subentry core --gc false --gm false
```

### Linting

Migration from [TSLint](https://palantir.github.io/tslint/) (depracted since 2019) to [ESLint](https://eslint.org/) (see [Migrationsanleitung](https://github.com/angular-eslint/angular-eslint#migrating-an-angular-cli-project-from-codelyzer-and-tslint)):

```bash
ng add @angular-eslint/schematics
ng g @angular-eslint/schematics:convert-tslint-to-eslint ng-base
rm tslint.json
npm uninstall tslint
npm uninstall codelyzer
```

Additional rules in `.eslintrc.json`:

```json
{
  "overrides": [
    {
      "rules": {
        "no-underscore-dangle": "off"
      }
    }
  ]
}
```

Install [Prettier](https://prettier.io/) and [prettier-quick](https://github.com/azz/pretty-quick#readme):

```bash
npm install --save-dev --save-exact prettier
npm install --save-dev pretty-quick
```

Add file `.prettierrc`:

```json
{
  "arrowParens": "always",
  "plugins": ["./extras/prettier-imports"],
  "printWidth": 120,
  "singleQuote": true
}
```

Add file `extras/prettier-imports.js`:

```javascript
const { parsers: typescriptParsers } = require('prettier/parser-typescript');
const ts = require('typescript');

// =============================================================================
// Prettier plugin to optimize and sort imports
// see https://github.com/prettier/prettier/issues/6260
// =============================================================================

class SingleLanguageServiceHost {
  constructor(name, content) {
    this.name = name;
    this.content = content;
    this.getCompilationSettings = ts.getDefaultCompilerOptions;
    this.getDefaultLibFileName = ts.getDefaultLibFilePath;
  }
  getScriptFileNames() {
    return [this.name];
  }
  getScriptVersion() {
    return ts.version;
  }
  getScriptSnapshot() {
    return ts.ScriptSnapshot.fromString(this.content);
  }
  getCurrentDirectory() {
    return '';
  }
}

function applyChanges(text, changes) {
  return changes.reduceRight((text, change) => {
    const head = text.slice(0, change.span.start);
    const tail = text.slice(change.span.start + change.span.length);
    return `${head}${change.newText}${tail}`;
  }, text);
}

function organizeImports(text) {
  const fileName = 'file.ts';
  const host = new SingleLanguageServiceHost(fileName, text);
  const languageService = ts.createLanguageService(host);
  const formatOptions = ts.getDefaultFormatCodeSettings();
  const fileChanges = languageService.organizeImports({ type: 'file', fileName }, formatOptions, {});
  const textChanges = [...fileChanges.map((change) => change.textChanges)];
  return applyChanges(text, textChanges);
}

const parsers = {
  typescript: {
    ...typescriptParsers.typescript,
    preprocess(text) {
      text = organizeImports(text);
      return text;
    },
  },
};

// Uses module.export because of 'Unexpected token export' error
module.exports = parsers;
```

Add scripts in `package.json`:

```json
"scripts": {
  ...
  "format:check": "prettier --config ./.prettierrc --list-different \"src/{app,environments,assets}/**/*{.ts,.js,.json,.scss}\"",
  "format:fix": "pretty-quick --staged",
  "format:fixAll": "prettier --write src",
  ...
}
```

`format:check`: Check only  
`format:fix`: Optimize stage files  
`format:fixAll`: Optimize all files

### Automatic optimizations and checks

Install [husky](https://typicode.github.io/husky):

```bash
npm install --save-dev husky
```

Add scripts in `package.json`:

```json
"scripts": {
  "check": "npm run format:fix && npm run lint",
  "postinstall": "husky install .husky",
}
```

Add pre-commit hook:
```
mkdir .husky
npx husky add .husky/pre-commit "cd $(dirname "$0") && npm run check"
```

Init husky via `npm i`.

### Optimize TypeScript config

To get a little more leeway in dealing with TypeScript's strict typing, the following rules should be disabled in `compilerOptions` of `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strictNullChecks": false,
    "strictPropertyInitialization": false,
    "noImplicitAny": false
  }
}
```
