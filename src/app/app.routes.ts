import { Routes } from '@angular/router';
import { FrontendComponent } from './frontend/frontend.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SortComponent } from './sort/sort.component';
import { EditorComponent } from './editor/editor.component';
import { PreviewComponent } from './preview/preview.component';

export const routes: Routes = [
    { path: 'viewer', component: FrontendComponent },
    {
        path: 'dashboard', component: DashboardComponent,
        children: [
            { path: 'editor', component: EditorComponent },
            { path: 'sort', component: SortComponent },
            { path: 'preview', component: PreviewComponent },
            { path: '', redirectTo: 'editor', pathMatch: 'full' }
        ]
    },
    { path: '', redirectTo: '/frontend', pathMatch: 'full' },
    { path: '**', component: FrontendComponent },
];
