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

For setting up a new project we recommend our [Angular Starter](https://github.com/lenneTech/angular-starter), which already contains this library and also includes a few sample elements as templates.

## Requirements

- [Angular Project (Version 11)](https://angular.io/tutorial/toh-pt0)

## Integration into an Angular project

Installation
```bash
cd path/to/your/angular-project
npm i @lenne.tech/ng-graphql-client
```

Integration in your App Module (`src/app/app.module.ts`):

```typescript
import { GraphQLModule } from '@lenne.tech/ng-graphql-client'
@NgModule({
  imports: [
      GraphQLModule.forRoot({
        apiUrl: 'https://url.to-your.domain/api',
        version: 'versionForLocalStorageKeys',
        prefix: 'prefixForLocalStorageKeys'
      })
  ],
})
```

## Usage

Description follows ...

