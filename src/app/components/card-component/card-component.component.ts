import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';

@Component({
  selector: 'card-component',
  standalone: true,
  imports: [NzCardModule],
  // templateUrl: './card-component.component.html',
  template: `
    <div style="padding:30px;">
      <nz-card style="width:300px;" [nzBordered]="isBordered" nzTitle="Card title">
        <ng-content></ng-content>        
        <!-- <p>Card content</p>
        <p>Card content</p>
        <p>Card content</p> -->
      </nz-card>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './card-component.component.scss',
})

export class CardComponent implements OnInit {
  @Input() 
  isBordered = true;

  constructor() {
    // this.isBordered = false;
  }

  ngOnInit() {
  }

}
