import { Routes } from '@angular/router';
import { FrontendComponent } from './frontend/frontend.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SortComponent } from './sort/sort.component';
import { EditorComponent } from './editor/editor.component';
import { PreviewComponent } from './preview/preview.component';
import { pendingChangesGuard } from './guards/pending-changes.guard';

export const routes: Routes = [
    { path: 'frontend', component: FrontendComponent },
    {
        path: 'dashboard', component: DashboardComponent,
        children: [
            { path: 'editor', component: EditorComponent, canDeactivate: [pendingChangesGuard] },
            { path: 'sort', component: SortComponent },
            { path: 'preview', component: PreviewComponent },
            { path: '', redirectTo: 'editor', pathMatch: 'full' }
        ]
    },
    { path: '', redirectTo: '/frontend', pathMatch: 'full' },
    { path: '**', component: FrontendComponent },
];
